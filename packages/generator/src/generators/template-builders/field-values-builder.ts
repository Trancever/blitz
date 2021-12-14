import {getPrismaSchema} from "../../utils/get-prisma-schema"
import {ResourceGeneratorOptions, Builder, CommonTemplateValues} from "./builder"
import {create as createStore} from "mem-fs"
import {create as createEditor, Editor} from "mem-fs-editor"
import * as ast from "@mrleebo/prisma-ast"

export class FieldValuesBuilder extends Builder<ResourceGeneratorOptions, CommonTemplateValues> {
  private getEditor = (): Editor => {
    if (this.fs !== undefined) {
      return this.fs
    }
    const store = createStore()
    this.fs = createEditor(store)
    return this.fs
  }

  // eslint-disable-next-line require-await
  public async getTemplateValues(options: ResourceGeneratorOptions): Promise<CommonTemplateValues> {
    const values: CommonTemplateValues = {
      parentModelId: this.getId(options.parentModel),
      parentModelIdZodType: undefined,
      parentModelParam: this.getParam(this.getId(options.parentModel)),
      parentModel: options.parentModel,
      parentModels: options.parentModels,
      ParentModel: options.ParentModel,
      ParentModels: options.ParentModels,
      modelId: this.getId(options.modelName),
      modelIdZodType: "number",
      modelIdParam: this.getParam(this.getId(options.modelName)),
      modelName: options.modelName,
      modelNames: options.modelNames,
      ModelName: options.ModelName,
      ModelNames: options.ModelNames,
      modelNamesPath: this.getModelNamesPath(options.context, options.modelNames),
    }
    if (options.extraArgs) {
      // specialArgs - these are arguments like 'id' or 'belongsTo', which are not meant to
      // be processed as fields but have their own special logic
      let specialArgs: {[key in string]: string} = {}

      const processSpecialArgs: Promise<void>[] = options.extraArgs.map(async (arg) => {
        const [valueName, typeName] = arg.split(":")
        if (valueName === "id") {
          values.modelIdZodType = await this.getZodType(typeName)
          specialArgs[arg] = "present"
        }
        if (valueName === "belongsTo"){
          // TODO: Determine how this is done. The model will generate with a field with the id name
          // and type of the parent of this model, and forms etc. should 
          // In addition, need to do the same logic that the options.parentModel != undefined below does
          specialArgs[arg] = "present"
        }
      })
      await Promise.all(processSpecialArgs)
      // Filter out special args by makins sure the argument isn't present in the list
      const nonSpecialArgs = options.extraArgs.filter((arg) => specialArgs[arg] !== "present")
      
      // Get the parent model it type if options.parentModel exists
      if (options.parentModel !== undefined && options.parentModel.length > 0) {
        const {schema} = getPrismaSchema(this.getEditor())
        // O(N) - N is total ast Blocks
        const model = schema.list.find(function (component): component is ast.Model {
          return component.type === "model" && component.name === options.rawParentModelName
        })

        if (model !== undefined) {
          // O(N) - N is number of properties in parent model
          const idField = model.properties.find(function (property): property is ast.Field {
            return (
              property.type === "field" &&
              property.attributes?.findIndex((attr) => attr.name === "id") !== -1
            )
          })

          // TODO: Do we want a map between prisma types and "user types", we can then use that map instead of these conditionals
          if (idField?.fieldType === "Int") {
            values.parentModelIdZodType = "number"
          } else if (idField?.fieldType === "String") {
            if (
              idField.attributes?.find(
                (attr) =>
                  attr.name === "default" &&
                  attr.args?.findIndex((arg) => arg.value === "uuid") !== -1,
              )
            ) {
              values.parentModelIdZodType = "string().uuid"
            } else {
              values.parentModelIdZodType = "string"
            }
          }
        } else {
          // TODO: handle scenario where parent wasnt found in existing schema. Should we throw an error, or a warning asking the user to verify that the parent model exists?
        }
      }
      if(nonSpecialArgs.length > 0){
        const ftv = await this.getFieldTemplateValues(nonSpecialArgs)
        return {...values, fieldTemplateValues: ftv}
      }
    }
    return values
  }
}