#include "CityLoader.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FString FShenchengjiCityLoader::SkeletonPath()
{
	return FPaths::ProjectContentDir() / TEXT("City/city-skeleton.json");
}

FString FShenchengjiCityLoader::StoryPath()
{
	return FPaths::ProjectContentDir() / TEXT("City/bay-last-delivery.json");
}

FString FShenchengjiCityLoader::ContentFile(const TCHAR* Relative)
{
	return FPaths::ProjectContentDir() / TEXT("City") / Relative;
}

TSharedPtr<FJsonObject> FShenchengjiCityLoader::ReadJsonFile(const FString& Path, FString& OutError)
{
	FString Json;
	if (!FFileHelper::LoadFileToString(Json, *Path))
	{
		OutError = FString::Printf(TEXT("无法读取 %s"), *Path);
		return nullptr;
	}
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		OutError = FString::Printf(TEXT("JSON 无效 %s"), *Path);
		return nullptr;
	}
	return Root;
}

static FShenchengjiGamePoint ReadPoint(const TSharedPtr<FJsonObject>& Object, const FString& FallbackId)
{
	FShenchengjiGamePoint Point;
	if (!Object.IsValid())
	{
		return Point;
	}
	Point.Id = Object->HasField(TEXT("id")) ? Object->GetStringField(TEXT("id")) : FallbackId;
	Point.Name = Object->HasField(TEXT("name")) ? Object->GetStringField(TEXT("name")) : FallbackId;
	Point.X = Object->HasField(TEXT("x")) ? Object->GetNumberField(TEXT("x")) : 0;
	Point.Z = Object->HasField(TEXT("z")) ? Object->GetNumberField(TEXT("z")) : 0;
	Point.Yaw = Object->HasField(TEXT("yaw")) ? Object->GetNumberField(TEXT("yaw")) : 0;
	Point.Heading = Object->HasField(TEXT("heading")) ? Object->GetNumberField(TEXT("heading")) : Point.Yaw;
	Point.BuildingX = Object->HasField(TEXT("buildingX")) ? Object->GetNumberField(TEXT("buildingX")) : Point.X;
	Point.BuildingZ = Object->HasField(TEXT("buildingZ")) ? Object->GetNumberField(TEXT("buildingZ")) : Point.Z;
	return Point;
}

bool FShenchengjiCityLoader::LoadSkeleton(FShenchengjiCitySkeleton& OutSkeleton, FString& OutError)
{
	const TSharedPtr<FJsonObject> Root = ReadJsonFile(SkeletonPath(), OutError);
	if (!Root.IsValid())
	{
		return false;
	}

	OutSkeleton = FShenchengjiCitySkeleton();
	if (Root->HasTypedField<EJson::Object>(TEXT("spawn")))
	{
		OutSkeleton.Spawn = ReadPoint(Root->GetObjectField(TEXT("spawn")), TEXT("spawn"));
	}

	const TSharedPtr<FJsonObject> Places = Root->HasTypedField<EJson::Object>(TEXT("places")) ? Root->GetObjectField(TEXT("places")) : nullptr;
	if (Places.IsValid())
	{
		for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Places->Values)
		{
			if (Pair.Value.IsValid() && Pair.Value->Type == EJson::Object)
			{
				OutSkeleton.Places.Add(Pair.Key, ReadPoint(Pair.Value->AsObject(), Pair.Key));
			}
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* LandmarkArray = nullptr;
	if (Root->TryGetArrayField(TEXT("landmarks"), LandmarkArray) && LandmarkArray)
	{
		for (const TSharedPtr<FJsonValue>& Value : *LandmarkArray)
		{
			if (Value.IsValid() && Value->Type == EJson::Object)
			{
				OutSkeleton.Landmarks.Add(ReadPoint(Value->AsObject(), TEXT("landmark")));
			}
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* RoadArray = nullptr;
	if (Root->TryGetArrayField(TEXT("roads"), RoadArray) && RoadArray)
	{
		for (const TSharedPtr<FJsonValue>& Value : *RoadArray)
		{
			const TSharedPtr<FJsonObject> RoadObject = Value.IsValid() ? Value->AsObject() : nullptr;
			if (!RoadObject.IsValid())
			{
				continue;
			}
			FShenchengjiSkeletonRoad Road;
			Road.Id = RoadObject->GetStringField(TEXT("id"));
			Road.Name = RoadObject->GetStringField(TEXT("name"));
			Road.Kind = RoadObject->GetStringField(TEXT("kind"));
			Road.Width = RoadObject->HasField(TEXT("width")) ? RoadObject->GetNumberField(TEXT("width")) : 6;
			const TArray<TSharedPtr<FJsonValue>>* Points = nullptr;
			if (RoadObject->TryGetArrayField(TEXT("points"), Points) && Points)
			{
				for (const TSharedPtr<FJsonValue>& PointValue : *Points)
				{
					const TSharedPtr<FJsonObject> PointObject = PointValue.IsValid() ? PointValue->AsObject() : nullptr;
					if (PointObject.IsValid())
					{
						Road.Points.Add(FVector2D(PointObject->GetNumberField(TEXT("x")), PointObject->GetNumberField(TEXT("z"))));
					}
				}
			}
			OutSkeleton.Roads.Add(MoveTemp(Road));
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* BuildingArray = nullptr;
	if (Root->TryGetArrayField(TEXT("buildings"), BuildingArray) && BuildingArray)
	{
		for (const TSharedPtr<FJsonValue>& Value : *BuildingArray)
		{
			const TSharedPtr<FJsonObject> BuildingObject = Value.IsValid() ? Value->AsObject() : nullptr;
			if (!BuildingObject.IsValid())
			{
				continue;
			}
			FShenchengjiSkeletonBuilding Building;
			Building.X = BuildingObject->GetNumberField(TEXT("x"));
			Building.Z = BuildingObject->GetNumberField(TEXT("z"));
			Building.W = BuildingObject->GetNumberField(TEXT("w"));
			Building.D = BuildingObject->GetNumberField(TEXT("d"));
			Building.Height = BuildingObject->GetNumberField(TEXT("height"));
			OutSkeleton.Buildings.Add(Building);
		}
	}

	static const TCHAR* Required[] = {TEXT("hub"), TEXT("office"), TEXT("park"), TEXT("bay"), TEXT("workshop")};
	for (const TCHAR* Id : Required)
	{
		if (!OutSkeleton.Places.Contains(Id))
		{
			OutError = FString::Printf(TEXT("城市骨架缺少地点 %s"), Id);
			return false;
		}
	}

	OutSkeleton.bLoaded = true;
	return true;
}
